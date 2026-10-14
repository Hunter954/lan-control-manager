package br.com.lancontrol;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.projection.*;
import android.os.*;
import android.view.*;
import android.widget.*;

public class MainActivity extends Activity {
  TextView status;
  Spinner mode;
  Button start, stop;
  volatile boolean paired = false;
  String pendingMode;
  Handler handler = new Handler();

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    if (state != null) pendingMode = state.getString("pendingMode");
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(1);
    int padding = (int) (24 * getResources().getDisplayMetrics().density);
    layout.setPadding(padding, padding, padding, padding);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(layout);
    setContentView(scroll);
    TextView title = new TextView(this);
    title.setText("LAN Control");
    title.setTextSize(26);
    layout.addView(title);
    TextView info = new TextView(this);
    info.setText(
        "Escolha o que compartilhar com o administrador. O Android solicita apenas as permissões"
            + " necessárias. Sem gravação ou toques remotos.");
    info.setTextSize(16);
    info.setPadding(0, padding, 0, padding);
    layout.addView(info);
    TextView label = new TextView(this);
    label.setText("Compartilhar");
    layout.addView(label);
    mode = new Spinner(this);
    ArrayAdapter<String> adapter =
        new ArrayAdapter<>(
            this,
            android.R.layout.simple_spinner_item,
            new String[] {"Tela", "Câmera traseira", "Câmera frontal"});
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    mode.setAdapter(adapter);
    layout.addView(mode);
    TextView cameraInfo = new TextView(this);
    cameraInfo.setText(
        "Na sessão de câmera, o administrador pode alternar entre frontal e traseira.");
    cameraInfo.setTextSize(14);
    layout.addView(cameraInfo);
    start =
        button(
            layout,
            "Iniciar sessão",
            () -> {
              if (!paired || pendingMode != null || ShareService.current != null) return;
              pendingMode =
                  new String[] {"screen", "rear", "front"}[mode.getSelectedItemPosition()];
              continueStart();
            });
    status = new TextView(this);
    status.setTextSize(16);
    status.setPadding(0, padding, 0, padding);
    layout.addView(status);
    stop =
        button(
            layout,
            "Encerrar sessão",
            () -> {
              pendingMode = null;
              if (ShareService.current != null) ShareService.current.end();
            });
    new Thread(
            () -> {
              try {
                Pairing.enroll(this);
                paired = true;
              } catch (Exception e) {
                runOnUiThread(
                    () ->
                        new AlertDialog.Builder(this)
                            .setMessage(
                                "Não foi possível conectar. Verifique a internet e baixe um novo"
                                    + " APK se o convite foi usado ou expirou.")
                            .setPositiveButton("OK", null)
                            .show());
              }
            })
        .start();
    handler.post(
        new Runnable() {
          public void run() {
            ShareService s = ShareService.current;
            start.setEnabled(paired && pendingMode == null && s == null);
            mode.setEnabled(pendingMode == null && s == null);
            stop.setVisibility(s == null ? View.GONE : View.VISIBLE);
            cameraInfo.setVisibility(
                mode.getSelectedItemPosition() == 0 && s == null ? View.GONE : View.VISIBLE);
            status.setText(
                !paired
                    ? "Conectando ao painel…"
                    : s != null
                        ? "Compartilhamento ativo · "
                            + (s.mode.equals("screen") ? "Tela" : "Câmera")
                            + "\n"
                            + s.message
                        : pendingMode != null
                            ? "Aguardando autorização do Android…"
                            : "Pronto para iniciar.");
            handler.postDelayed(this, 500);
          }
        });
  }

  Button button(LinearLayout layout, String label, Runnable action) {
    Button b = new Button(this);
    b.setText(label);
    b.setMinHeight((int) (48 * getResources().getDisplayMetrics().density));
    layout.addView(b, new LinearLayout.LayoutParams(-1, -2));
    b.setOnClickListener(v -> action.run());
    return b;
  }

  void continueStart() {
    if (pendingMode == null || !paired || ShareService.current != null) {
      pendingMode = null;
      return;
    }
    if (Build.VERSION.SDK_INT >= 33
        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 11);
      return;
    }
    if (!pendingMode.equals("screen")
        && checkSelfPermission(android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {android.Manifest.permission.CAMERA}, 12);
      return;
    }
    if (pendingMode.equals("screen")) {
      MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
      Intent intent =
          Build.VERSION.SDK_INT >= 34
              ? manager.createScreenCaptureIntent(
                  MediaProjectionConfig.createConfigForDefaultDisplay())
              : manager.createScreenCaptureIntent();
      startActivityForResult(intent, 41);
    } else {
      launch(
          new Intent(this, ShareService.class)
              .putExtra("mode", "camera")
              .putExtra("facing", pendingMode));
    }
  }

  void launch(Intent intent) {
    pendingMode = null;
    intent.putExtra("control", false);
    startForegroundService(intent);
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request != 41) return;
    if (result == RESULT_OK && data != null && "screen".equals(pendingMode)) {
      launch(
          new Intent(this, ShareService.class)
              .putExtra("mode", "screen")
              .putExtra("grant", data)
              .putExtra("result", result));
    } else pendingMode = null;
  }

  @Override
  public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(request, permissions, results);
    if (request != 11 && request != 12) return;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) continueStart();
    else {
      pendingMode = null;
      Toast.makeText(
              this, "Sessão não iniciada. A permissão solicitada é necessária.", Toast.LENGTH_LONG)
          .show();
    }
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    state.putString("pendingMode", pendingMode);
    super.onSaveInstanceState(state);
  }

  @Override
  protected void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    super.onDestroy();
  }
}
