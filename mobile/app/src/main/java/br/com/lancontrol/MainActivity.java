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
  boolean paired = false;
  Handler handler = new Handler();

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(1);
    layout.setPadding(28, 38, 28, 28);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(layout);
    setContentView(scroll);
    TextView title = new TextView(this);
    title.setText("LAN Control Android");
    title.setTextSize(26);
    layout.addView(title);
    TextView info = new TextView(this);
    info.setText(
        "Você inicia e encerra cada sessão. Tela e câmera são transmitidas ao administrador"
            + " conectado ao painel. Na sessão de câmera, o administrador pode alternar entre"
            + " frontal e traseira. Esta versão permite visualizar, sem toques remotos. Não há"
            + " gravação nem acesso silencioso. Sessões duram até 15 minutos.");
    info.setTextSize(16);
    info.setPadding(0, 20, 0, 20);
    layout.addView(info);
    status = new TextView(this);
    status.setTextSize(17);
    layout.addView(status);
    button(
        layout,
        "Compartilhar tela",
        () -> {
          if (!ready()) return;
          MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
          Intent intent =
              Build.VERSION.SDK_INT >= 34
                  ? manager.createScreenCaptureIntent(
                      MediaProjectionConfig.createConfigForDefaultDisplay())
                  : manager.createScreenCaptureIntent();
          startActivityForResult(intent, 41);
        });
    button(layout, "Compartilhar câmera traseira", () -> camera("rear"));
    button(layout, "Compartilhar câmera frontal", () -> camera("front"));
    button(
        layout,
        "ENCERRAR SESSÃO",
        () -> {
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
                                    + " APK personalizado se o convite foi usado ou expirou.")
                            .setPositiveButton("OK", null)
                            .show());
              }
            })
        .start();
    handler.post(
        new Runnable() {
          public void run() {
            ShareService s = ShareService.current;
            status.setText(
                !paired
                    ? "Conectando ao painel…"
                    : s == null
                        ? "Pareado. Nenhum compartilhamento ativo."
                        : "Sessão ativa: "
                            + s.mode
                            + "\nControle: "
                            + (s.controlAllowed ? "permitido" : "não permitido")
                            + "\n"
                            + s.message);
            handler.postDelayed(this, 1000);
          }
        });
    if (Build.VERSION.SDK_INT >= 33
        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED)
      requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 11);
  }

  void button(LinearLayout l, String label, Runnable action) {
    Button b = new Button(this);
    b.setText(label);
    b.setPadding(12, 16, 12, 16);
    l.addView(b, new LinearLayout.LayoutParams(-1, -2));
    b.setOnClickListener(v -> action.run());
  }

  boolean ready() {
    if (Build.VERSION.SDK_INT >= 33
        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 11);
      Toast.makeText(
              this, "Autorize as notificações para manter a sessão visível.", Toast.LENGTH_LONG)
          .show();
      return false;
    }
    if (!paired) {
      Toast.makeText(this, "Aguarde o pareamento com o painel.", Toast.LENGTH_LONG).show();
      return false;
    }
    if (ShareService.current != null) {
      Toast.makeText(this, "Encerre a sessão atual antes de iniciar outra.", Toast.LENGTH_LONG)
          .show();
      return false;
    }
    return true;
  }

  String pendingFacing = "rear";

  void camera(String facing) {
    if (!ready()) return;
    pendingFacing = facing;
    if (checkSelfPermission(android.Manifest.permission.CAMERA)
        != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {android.Manifest.permission.CAMERA}, 12);
      return;
    }
    launch(
        new Intent(this, ShareService.class).putExtra("mode", "camera").putExtra("facing", facing));
  }

  void launch(Intent intent) {
    intent.putExtra("control", false);
    startForegroundService(intent);
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 41 && result == RESULT_OK && data != null)
      launch(
          new Intent(this, ShareService.class)
              .putExtra("mode", "screen")
              .putExtra("grant", data)
              .putExtra("result", result));
  }

  @Override
  public void onRequestPermissionsResult(int r, String[] p, int[] results) {
    super.onRequestPermissionsResult(r, p, results);
    if (r == 12 && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
      camera(pendingFacing);
  }

  @Override
  protected void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    super.onDestroy();
  }
}
