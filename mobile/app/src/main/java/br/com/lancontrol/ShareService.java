package br.com.lancontrol;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.*;
import android.hardware.camera2.*;
import android.hardware.display.*;
import android.media.*;
import android.media.projection.*;
import android.os.*;
import android.util.Size;
import android.view.*;
import java.io.ByteArrayOutputStream;
import java.util.*;
import okhttp3.*;
import okio.ByteString;
import org.json.JSONObject;

public class ShareService extends Service {
  public static volatile ShareService current;
  public volatile String mode = "waiting", message = "Aguardando operador", facing = "rear";
  public volatile boolean controlAllowed = false;
  HandlerThread worker;
  Handler work;
  Handler main = new Handler(Looper.getMainLooper());
  WebSocket socket;
  MediaProjection projection;
  VirtualDisplay display;
  ImageReader reader;
  CameraDevice camera;
  CameraCaptureSession cameraSession;
  long lastFrame = 0;
  volatile boolean ending = false;
  volatile int cameraGeneration = 0;
  int captureWidth = 0, captureHeight = 0;

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int id) {
    if (intent == null) return START_NOT_STICKY;
    if ("STOP".equals(intent.getAction())) {
      end();
      return START_NOT_STICKY;
    }
    if (current != null) return START_NOT_STICKY;
    current = this;
    mode = intent.getStringExtra("mode");
    facing = intent.getStringExtra("facing") == null ? "rear" : intent.getStringExtra("facing");
    controlAllowed = false;
    try {
      if (Build.VERSION.SDK_INT >= 33
          && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
              != android.content.pm.PackageManager.PERMISSION_GRANTED)
        throw new SecurityException("Notification permission required");
      NotificationManager nm = getSystemService(NotificationManager.class);
      nm.createNotificationChannel(
          new NotificationChannel(
              "sharing", "Compartilhamento ativo", NotificationManager.IMPORTANCE_LOW));
      if (Build.VERSION.SDK_INT >= 29)
        startForeground(
            9,
            notification(),
            mode.equals("screen")
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                : ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
      else startForeground(9, notification());
      worker = new HandlerThread("lan-capture");
      worker.start();
      work = new Handler(worker.getLooper());
      connect();
      if (mode.equals("screen")) {
        MediaProjectionManager mgr = getSystemService(MediaProjectionManager.class);
        projection =
            mgr.getMediaProjection(
                intent.getIntExtra("result", Activity.RESULT_CANCELED),
                (Intent) intent.getParcelableExtra("grant"));
        projection.registerCallback(
            new MediaProjection.Callback() {
              @Override
              public void onStop() {
                main.post(() -> end());
              }

              @Override
              public void onCapturedContentResize(int w, int h) {
                work.post(() -> resize(w, h));
              }
            },
            work);
        Point p = realSize(this);
        makeReader(p.x, p.y);
        display =
            projection.createVirtualDisplay(
                "LAN Control tela",
                captureWidth,
                captureHeight,
                getResources().getDisplayMetrics().densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.getSurface(),
                null,
                work);
      } else openCamera();
    } catch (Exception e) {
      report("Não foi possível iniciar. Verifique as permissões no tablet.");
      end();
    }
    return START_NOT_STICKY;
  }

  Notification notification() {
    Intent stop = new Intent(this, ShareService.class).setAction("STOP");
    PendingIntent action =
        PendingIntent.getService(
            this, 9, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent open =
        PendingIntent.getActivity(
            this,
            10,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this, "sharing")
        .setSmallIcon(android.R.drawable.ic_menu_view)
        .setContentTitle("LAN Control — compartilhamento ativo")
        .setContentText(
            mode.equals("screen")
                ? "Tela transmitida · controle " + (controlAllowed ? "permitido" : "desativado")
                : "Câmera " + (facing.equals("front") ? "frontal" : "traseira") + " transmitida")
        .setContentIntent(open)
        .setOngoing(true)
        .addAction(new Notification.Action.Builder(null, "ENCERRAR", action).build())
        .build();
  }

  public void setControl(boolean allowed) {
    controlAllowed = false;
    getSystemService(NotificationManager.class).notify(9, notification());
    sendStatus();
  }

  void connect() throws Exception {
    String token = Pairing.getToken(this), id = Pairing.getId(this);
    if (token == null || id.isEmpty()) throw new Exception();
    OkHttpClient client =
        new OkHttpClient.Builder().pingInterval(20, java.util.concurrent.TimeUnit.SECONDS).build();
    socket =
        client.newWebSocket(
            new Request.Builder()
                .url(Pairing.ORIGIN.replace("https://", "wss://") + "/api/mobile/live?device=" + id)
                .header("Authorization", "Bearer " + token)
                .build(),
            new WebSocketListener() {
              @Override
              public void onOpen(WebSocket ws, Response r) {
                message = "Pronto para o operador no painel";
                sendStatus();
              }

              @Override
              public void onMessage(WebSocket ws, String value) {
                try {
                  JSONObject command = new JSONObject(value);
                  if (!"control".equals(command.optString("type"))) return;
                  String a = command.optString("action");
                  main.post(
                      () -> {
                        if (a.equals("stop")) {
                          end();
                          return;
                        }
                        if (a.equals("front") || a.equals("rear")) {
                          if (mode.equals("camera") && !facing.equals(a)) {
                            facing = a;
                            work.post(
                                () -> {
                                  try {
                                    closeCamera();
                                    openCamera();
                                    sendStatus();
                                  } catch (Exception e) {
                                    report("Câmera indisponível");
                                    end();
                                  }
                                });
                          }
                          return;
                        }
                        // Viewing edition: remote input is not supported.
                      });
                } catch (Exception ignored) {
                }
              }

              @Override
              public void onFailure(WebSocket ws, Throwable t, Response r) {
                main.post(
                    () -> {
                      report("Conexão encerrada. Inicie nova sessão para tentar novamente.");
                      end();
                    });
              }

              @Override
              public void onClosing(WebSocket ws, int code, String reason) {
                ws.close(code, reason);
                main.post(() -> end());
              }

              @Override
              public void onClosed(WebSocket ws, int code, String reason) {
                main.post(() -> end());
              }
            });
  }

  void sendStatus() {
    try {
      if (socket == null) return;
      JSONObject v = new JSONObject();
      v.put("type", "status");
      v.put("mode", mode);
      v.put("control", controlAllowed);
      v.put("facing", facing);
      if (captureWidth > 0) {
        v.put("width", captureWidth);
        v.put("height", captureHeight);
      }
      v.put("message", message);
      socket.send(v.toString());
    } catch (Exception ignored) {
    }
  }

  public void report(String value) {
    message = value;
    sendStatus();
  }

  void makeReader(int realW, int realH) {
    float ratio = Math.min(1f, 1024f / Math.max(realW, realH));
    captureWidth = Math.max(1, (int) (realW * ratio));
    captureHeight = Math.max(1, (int) (realH * ratio));
    reader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2);
    reader.setOnImageAvailableListener(
        r -> {
          Image image = null;
          try {
            image = r.acquireLatestImage();
            if (image == null || !frameReady()) return;
            Image.Plane p = image.getPlanes()[0];
            int pad = p.getRowStride() - p.getPixelStride() * captureWidth;
            Bitmap raw =
                Bitmap.createBitmap(
                    captureWidth + pad / p.getPixelStride(),
                    captureHeight,
                    Bitmap.Config.ARGB_8888);
            raw.copyPixelsFromBuffer(p.getBuffer());
            Bitmap crop = Bitmap.createBitmap(raw, 0, 0, captureWidth, captureHeight);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            crop.compress(Bitmap.CompressFormat.JPEG, 55, out);
            sendFrame(out.toByteArray());
            if (crop != raw) crop.recycle();
            raw.recycle();
          } catch (Exception ignored) {
          } finally {
            if (image != null) image.close();
          }
        },
        work);
    sendStatus();
  }

  void resize(int w, int h) {
    if (display == null || ending) return;
    ImageReader old = reader;
    makeReader(w, h);
    display.setSurface(reader.getSurface());
    display.resize(captureWidth, captureHeight, getResources().getDisplayMetrics().densityDpi);
    if (old != null) old.close();
  }

  boolean frameReady() {
    long now = SystemClock.elapsedRealtime();
    if (ending || socket == null || socket.queueSize() > 512000 || now - lastFrame < 250)
      return false;
    lastFrame = now;
    return true;
  }

  void sendFrame(byte[] bytes) {
    if (socket != null && bytes.length < 512000) socket.send(ByteString.of(bytes));
  }

  void openCamera() throws Exception {
    final int generation = ++cameraGeneration;
    CameraManager cm = getSystemService(CameraManager.class);
    String selected = null;
    CameraCharacteristics info = null;
    for (String id : cm.getCameraIdList()) {
      CameraCharacteristics c = cm.getCameraCharacteristics(id);
      Integer face = c.get(CameraCharacteristics.LENS_FACING);
      if (face != null
          && face
              == (facing.equals("front")
                  ? CameraCharacteristics.LENS_FACING_FRONT
                  : CameraCharacteristics.LENS_FACING_BACK)) {
        selected = id;
        info = c;
        break;
      }
    }
    if (selected == null) throw new Exception();
    Size[] sizes =
        info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            .getOutputSizes(ImageFormat.JPEG);
    Size chosen =
        Arrays.stream(sizes)
            .min(
                Comparator.comparingLong(
                    s -> Math.abs((long) s.getWidth() * s.getHeight() - 640L * 480)))
            .get();
    captureWidth = chosen.getWidth();
    captureHeight = chosen.getHeight();
    Integer orientation = info.get(CameraCharacteristics.SENSOR_ORIENTATION);
    reader = ImageReader.newInstance(captureWidth, captureHeight, ImageFormat.JPEG, 2);
    reader.setOnImageAvailableListener(
        r -> {
          Image image = null;
          try {
            image = r.acquireLatestImage();
            if (image == null || !frameReady()) return;
            java.nio.ByteBuffer b = image.getPlanes()[0].getBuffer();
            byte[] bytes = new byte[b.remaining()];
            b.get(bytes);
            sendFrame(bytes);
          } catch (Exception ignored) {
          } finally {
            if (image != null) image.close();
          }
        },
        work);
    cm.openCamera(
        selected,
        new CameraDevice.StateCallback() {
          @Override
          public void onOpened(CameraDevice c) {
            if (ending || generation != cameraGeneration) {
              c.close();
              return;
            }
            camera = c;
            try {
              CaptureRequest.Builder request =
                  c.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
              request.addTarget(reader.getSurface());
              request.set(CaptureRequest.JPEG_ORIENTATION, orientation == null ? 0 : orientation);
              c.createCaptureSession(
                  Collections.singletonList(reader.getSurface()),
                  new CameraCaptureSession.StateCallback() {
                    @Override
                    public void onConfigured(CameraCaptureSession session) {
                      if (ending || generation != cameraGeneration) {
                        session.close();
                        return;
                      }
                      cameraSession = session;
                      try {
                        session.setRepeatingRequest(request.build(), null, work);
                        sendStatus();
                      } catch (Exception e) {
                        main.post(() -> end());
                      }
                    }

                    @Override
                    public void onConfigureFailed(CameraCaptureSession s) {
                      main.post(() -> end());
                    }
                  },
                  work);
            } catch (Exception e) {
              main.post(() -> end());
            }
          }

          @Override
          public void onDisconnected(CameraDevice c) {
            c.close();
            if (generation == cameraGeneration) main.post(() -> end());
          }

          @Override
          public void onError(CameraDevice c, int e) {
            c.close();
            if (generation == cameraGeneration) main.post(() -> end());
          }
        },
        work);
    getSystemService(NotificationManager.class).notify(9, notification());
  }

  void closeCamera() {
    cameraGeneration++;
    if (cameraSession != null) {
      cameraSession.close();
      cameraSession = null;
    }
    if (camera != null) {
      camera.close();
      camera = null;
    }
    if (reader != null) {
      reader.close();
      reader = null;
    }
  }

  public void end() {
    if (ending) return;
    ending = true;
    mode = "stopped";
    controlAllowed = false;
    sendStatus();
    if (socket != null) {
      socket.close(1000, "Encerrado no dispositivo");
      socket = null;
    }
    if (display != null) {
      display.release();
      display = null;
    }
    if (projection != null) {
      projection.stop();
      projection = null;
    }
    closeCamera();
    if (worker != null) worker.quitSafely();
    main.removeCallbacksAndMessages(null);
    current = null;
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }

  @Override
  public void onDestroy() {
    end();
    super.onDestroy();
  }

  static Point realSize(Context context) {
    WindowManager wm = context.getSystemService(WindowManager.class);
    if (Build.VERSION.SDK_INT >= 30) {
      Rect bounds = wm.getMaximumWindowMetrics().getBounds();
      return new Point(bounds.width(), bounds.height());
    }
    Point p = new Point();
    wm.getDefaultDisplay().getRealSize(p);
    return p;
  }
}
