"""Service for sending emails (password reset, notifications).

If SMTP settings are configured in environment (PF_SMTP_HOST), emails will be sent via SMTP.
Otherwise, in local/development mode, instructions and reset tokens are logged to stdout/logger.
"""

from __future__ import annotations

import email.message
import logging
import smtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(
    to_email: str,
    username: str,
    reset_token: str,
    reset_url: str | None = None,
) -> bool:
    """Send a password reset email to the user.

    Returns True if sent or handled, False on failure.
    """
    url = reset_url or f"{settings.app_url.rstrip('/')}/reset-password?token={reset_token}"

    subject = f"[{settings.app_name}] Yêu cầu đặt lại mật khẩu"
    body_text = f"""Xin chào {username},

Bạn nhận được email này vì đã có yêu cầu đặt lại mật khẩu cho tài khoản {username} ({to_email}) trên hệ thống {settings.app_name}.

Để đặt lại mật khẩu của bạn, vui lòng truy cập đường link sau:
{url}

Mã token xác nhận:
{reset_token}

(Liên kết này có hiệu lực trong vòng 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email này an toàn.)
"""

    body_html = f"""<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2563eb;">Yêu cầu đặt lại mật khẩu</h2>
    <p>Xin chào <strong>{username}</strong>,</p>
    <p>Bạn nhận được email này vì có yêu cầu đặt lại mật khẩu cho tài khoản trên hệ thống <strong>{settings.app_name}</strong>.</p>
    <div style="margin: 25px 0;">
        <a href="{url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Đặt lại mật khẩu ngay
        </a>
    </div>
    <p style="font-size: 13px; color: #64748b;">Hoặc sao chép đường dẫn sau vào trình duyệt:<br/><a href="{url}">{url}</a></p>
    <p style="font-size: 13px; color: #64748b;">Mã token: <code>{reset_token}</code></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
    <p style="font-size: 12px; color: #94a3b8;">Liên kết này có hiệu lực trong vòng 1 giờ. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>
</body>
</html>
"""

    is_prod = settings.environment.strip().lower() in ("production", "prod", "staging")

    if not settings.smtp_host:
        if is_prod:
            logger.error(
                "SMTP not configured in production environment. Password reset email cannot be sent."
            )
            raise RuntimeError("SMTP not configured in production environment.")
        logger.info(
            "SMTP not configured (dev mode). Password reset link for %s (%s):\n%s\nToken: %s",
            username,
            to_email,
            url,
            reset_token,
        )
        return True

    try:
        msg = email.message.EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email
        msg["To"] = to_email
        msg.set_content(body_text)
        msg.add_alternative(body_html, subtype="html")

        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                if settings.smtp_user and settings.smtp_password:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_user and settings.smtp_password:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)

        logger.info("Sent password reset email to %s", to_email)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Failed to send password reset email to %s: %s", to_email, exc)
        if is_prod:
            raise RuntimeError(f"Failed to send password reset email via SMTP: {exc}") from exc
        return False
