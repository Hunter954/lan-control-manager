package br.com.lancontrol;

import android.accessibilityservice.*;
import android.app.KeyguardManager;
import android.graphics.Path;
import android.os.Bundle;
import android.view.accessibility.*;
import org.json.JSONObject;

public class ControlService extends AccessibilityService {
  public static volatile ControlService current;

  @Override
  public void onServiceConnected() {
    current = this;
  }

  @Override
  public void onAccessibilityEvent(AccessibilityEvent e) {}

  @Override
  public void onInterrupt() {}

  @Override
  public void onDestroy() {
    current = null;
    super.onDestroy();
  }

  void execute(JSONObject command) {
    ShareService s = ShareService.current;
    if (s == null || !s.controlAllowed || !"screen".equals(s.mode)) return;
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null || getSystemService(KeyguardManager.class).isKeyguardLocked()) return;
    String pkg = String.valueOf(root.getPackageName());
    if (pkg.contains("permission")
        || pkg.contains("packageinstaller")
        || pkg.contains("settings")
        || pkg.contains("systemmanager")
        || pkg.contains("securitycenter")
        || pkg.equals("com.android.systemui")) {
      s.report("Controle indisponível em telas de segurança e permissões.");
      return;
    }
    AccessibilityNodeInfo focusNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
    if (focusNode != null && focusNode.isPassword()) {
      s.report("Campos de senha devem ser preenchidos no dispositivo.");
      return;
    }
    try {
      String action = command.getString("action");
      if (action.equals("back")) {
        performGlobalAction(GLOBAL_ACTION_BACK);
        return;
      }
      if (action.equals("home")) {
        performGlobalAction(GLOBAL_ACTION_HOME);
        return;
      }
      if (action.equals("recent")) {
        performGlobalAction(GLOBAL_ACTION_RECENTS);
        return;
      }
      if (action.equals("text")) {
        AccessibilityNodeInfo focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focus != null && focus.isEditable() && !focus.isPassword()) {
          Bundle b = new Bundle();
          b.putCharSequence(
              AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
              command.getString("text"));
          focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
        }
        return;
      }
      android.graphics.Point size = ShareService.realSize(this);
      Path path = new Path();
      path.moveTo(
          Math.min(size.x - 1, (float) command.getDouble("x") * size.x),
          Math.min(size.y - 1, (float) command.getDouble("y") * size.y));
      long duration = command.optLong("duration", 60);
      if (action.equals("swipe")) {
        path.lineTo(
            Math.min(size.x - 1, (float) command.getDouble("endX") * size.x),
            Math.min(size.y - 1, (float) command.getDouble("endY") * size.y));
        duration = command.getLong("duration");
      }
      dispatchGesture(
          new GestureDescription.Builder()
              .addStroke(new GestureDescription.StrokeDescription(path, 0, duration))
              .build(),
          null,
          null);
    } catch (Exception e) {
      s.report("Não foi possível aplicar o gesto.");
    }
  }
}
