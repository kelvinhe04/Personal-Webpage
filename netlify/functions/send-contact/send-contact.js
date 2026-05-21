const RESEND_API_URL = "https://api.resend.com/emails";

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: "Method not allowed" }),
        };
    }

    try {
        const { from_name, reply_to, subject, message } = JSON.parse(event.body);

        if (!from_name || !reply_to || !subject || !message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: "Todos los campos son requeridos" }),
            };
        }

        if (!process.env.RESEND_API_KEY) {
            console.error("RESEND_API_KEY no está configurada");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: "Error de configuración del servidor" }),
            };
        }

        const html = buildEmailTemplate({ from_name, reply_to, subject, message });

        const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: "Kelvin He <onboarding@resend.dev>",
                to: ["kelvinhe04@gmail.com"],
                reply_to: reply_to,
                subject: `${from_name} te envió un mensaje - ${subject}`,
                html,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Resend API error:", data);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: data.message || "Error al enviar el email",
                }),
            };
        }

        console.log("Email sent:", data.id);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: "Mensaje enviado exitosamente! Te responderé pronto.",
            }),
        };
    } catch (error) {
        console.error("Error en send-contact:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: "Error al enviar el mensaje. Inténtalo de nuevo.",
            }),
        };
    }
};

function buildEmailTemplate({ from_name, reply_to, subject, message }) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0f0f23;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f23;padding:60px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.06);backdrop-filter:blur(20px);border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);box-shadow:0 20px 60px rgba(0,0,0,0.3);">

          <tr>
            <td style="padding:50px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="display:inline-block;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#00C6FF,#0072ff);font-size:28px;line-height:60px;text-align:center;color:#fff;">KH</span>
                    <h1 style="color:#ffffff;margin:20px 0 8px;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Nuevo Mensaje</h1>
                    <p style="color:rgba(255,255,255,0.5);margin:0 0 30px;font-size:14px;">Alguien te escribi\u00F3 desde tu sitio web</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 40px;">
              <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:20px;border:1px solid rgba(255,255,255,0.06);">
                <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Remitente</span>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                  <tr>
                    <td style="padding:6px 0;">
                      <span style="color:rgba(255,255,255,0.35);font-size:12px;">Nombre</span>
                      <p style="color:#ffffff;margin:2px 0 0;font-size:15px;font-weight:600;">${from_name}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;border-top:1px solid rgba(255,255,255,0.06);">
                      <span style="color:rgba(255,255,255,0.35);font-size:12px;">Correo</span>
                      <p style="margin:2px 0 0;font-size:15px;">
                        <a href="mailto:${reply_to}" style="color:#00C6FF;text-decoration:none;">${reply_to}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;border-top:1px solid rgba(255,255,255,0.06);">
                      <span style="color:rgba(255,255,255,0.35);font-size:12px;">Asunto</span>
                      <p style="color:#ffffff;margin:2px 0 0;font-size:15px;font-weight:600;">${subject}</p>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="margin-top:20px;background:rgba(255,255,255,0.03);border-radius:12px;padding:20px;border:1px solid rgba(255,255,255,0.06);">
                <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Mensaje</span>
                <div style="margin-top:10px;border-left:3px solid #00C6FF;padding-left:16px;">
                  <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;line-height:1.8;white-space:pre-wrap;">${message}</p>
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0;text-align:center;">Enviado desde kelvin-he.netlify.app</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
