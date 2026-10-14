package br.com.lancontrol;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import okhttp3.*;
import org.json.JSONObject;

final class Pairing {
  static final String ORIGIN = "https://lan-control-manager-production.up.railway.app";

  static String getToken(Context c) throws Exception {
    String value = c.getSharedPreferences("pair", 0).getString("token", null);
    if (value == null) return null;
    String[] bits = value.split(":");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(bits[0], 0)));
    return new String(
        cipher.doFinal(Base64.decode(bits[1], 0)), java.nio.charset.StandardCharsets.UTF_8);
  }

  static String getId(Context c) {
    return c.getSharedPreferences("pair", 0).getString("id", "");
  }

  static void enroll(Context c) throws Exception {
    String previous = getToken(c);
    if (previous != null) {
      try (Response res =
          new OkHttpClient()
              .newCall(
                  new Request.Builder()
                      .url(ORIGIN + "/api/agent/info")
                      .header("Authorization", "Bearer " + previous)
                      .build())
              .execute()) {
        if (res.isSuccessful()) return;
        if (res.code() != 401) throw new Exception("Connection unavailable");
        c.getSharedPreferences("pair", 0).edit().clear().commit();
      }
    }

    java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
    try (java.io.InputStream input = c.getAssets().open("enrollment.json")) {
      byte[] buffer = new byte[4096];
      int n;
      while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
    }
    JSONObject config = new JSONObject(output.toString("UTF-8"));
    if (!ORIGIN.equals(config.getString("serverUrl"))) throw new Exception("Invalid origin");
    JSONObject body = new JSONObject();
    body.put("token", config.getString("token"));
    String name = android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL;
    body.put("hostname", name.substring(0, Math.min(160, name.length())));
    OkHttpClient client = new OkHttpClient();
    Request req =
        new Request.Builder()
            .url(ORIGIN + "/api/agent/enroll")
            .post(RequestBody.create(body.toString(), MediaType.get("application/json")))
            .build();
    try (Response res = client.newCall(req).execute()) {
      if (!res.isSuccessful()) throw new Exception("Invite expired or used");
      JSONObject data = new JSONObject(res.body().string());
      if (!"android".equals(data.getString("role"))) throw new Exception("Invalid role");
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key());
      String encrypted =
          Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
              + ":"
              + Base64.encodeToString(
                  cipher.doFinal(
                      data.getString("token").getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                  Base64.NO_WRAP);
      c.getSharedPreferences("pair", 0)
          .edit()
          .putString("token", encrypted)
          .putString("id", data.getString("id"))
          .apply();
    }
  }

  private static SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (store.containsAlias("lan-pair")) return (SecretKey) store.getKey("lan-pair", null);
    KeyGenerator generator =
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(
        new KeyGenParameterSpec.Builder(
                "lan-pair", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
    return generator.generateKey();
  }
}
