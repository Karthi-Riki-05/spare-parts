const { Resend } = require('resend');
const { logger } = require('../utils/logger');

const resendApiKey = process.env.RESEND_API_KEY || '';
const appUrl = process.env.APP_URL || 'http://localhost:3000';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Send job completion email
 */
async function sendJobCompletionEmail(jobData, stats) {
  try {
    if (!resend) {
      logger.warn(`[EMAIL] Resend not configured, skipping email to ${jobData.user_email}`);
      return false;
    }
    
    const resultsUrl = `${appUrl}/results/${jobData.id}`;
    
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .stats { margin: 20px 0; }
            .stat-row { display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #eee; }
            .stat-label { font-weight: bold; }
            .stat-value { text-align: right; }
            .button { display: inline-block; background: #00bcd4; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; margin: 20px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Verification Complete</h1>
              <p>Your spare parts verification job has finished processing.</p>
            </div>
            <div class="content">
              <p>File: <strong>${jobData.file_name}</strong></p>
              <p>Total rows: <strong>${jobData.total_rows}</strong></p>
              
              <div class="stats">
                <h3>Results Summary</h3>
                <div class="stat-row">
                  <span class="stat-label">Score ≥90 (Official):</span>
                  <span class="stat-value">${stats.scoreAbove90}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">Score 70-89 (Distributor):</span>
                  <span class="stat-value">${stats.score50to89}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">Score <70 (Partial/Not found):</span>
                  <span class="stat-value">${stats.scoreBelow50}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">Web Verified:</span>
                  <span class="stat-value">${stats.webVerified}</span>
                </div>
              </div>
              
              <p><a href="${resultsUrl}" class="button">View Results</a></p>
              <p>Or download the Excel file from the results page.</p>
              
              <p style="margin-top: 30px; color: #666; font-size: 14px;">
                If you have any questions or need support, please contact us.
              </p>
            </div>
            <div class="footer">
              <p>Spare Parts Web Verifier | Powered by AI</p>
            </div>
          </div>
        </body>
      </html>
    `;
    
    const response = await resend.emails.send({
      from: 'noreply@sparepartsverifier.com',
      to: jobData.user_email,
      subject: `✅ Spare Parts Verification Complete — ${jobData.file_name}`,
      html: htmlContent,
    });
    
    if (response.error) {
      logger.error(`[EMAIL] Failed to send email to ${jobData.user_email}: ${response.error.message}`);
      return false;
    }
    
    logger.info(`[EMAIL] Sent completion email to ${jobData.user_email} for job ${jobData.id}`);
    return true;
  } catch (err) {
    logger.error(`[EMAIL] Exception sending email: ${err.message}`);
    return false;
  }
}

/**
 * Send error notification email
 */
async function sendErrorEmail(jobData, errorMessage) {
  try {
    if (!resend) {
      logger.warn(`[EMAIL] Resend not configured, skipping error email to ${jobData.user_email}`);
      return false;
    }
    
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .error-box { background: #ffebee; border: 1px solid #f44336; padding: 15px; border-radius: 4px; margin: 20px 0; color: #c62828; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Verification Error</h1>
              <p>Your spare parts verification job encountered an error.</p>
            </div>
            <div class="content">
              <p>File: <strong>${jobData.file_name}</strong></p>
              
              <div class="error-box">
                <p><strong>Error:</strong></p>
                <p>${errorMessage}</p>
              </div>
              
              <p>Please try uploading your file again. If the problem persists, please contact support.</p>
            </div>
            <div class="footer">
              <p>Spare Parts Web Verifier | Powered by AI</p>
            </div>
          </div>
        </body>
      </html>
    `;
    
    const response = await resend.emails.send({
      from: 'noreply@sparepartsverifier.com',
      to: jobData.user_email,
      subject: `⚠️ Verification Error — ${jobData.file_name}`,
      html: htmlContent,
    });
    
    if (response.error) {
      logger.error(`[EMAIL] Failed to send error email to ${jobData.user_email}`);
      return false;
    }
    
    logger.info(`[EMAIL] Sent error email to ${jobData.user_email} for job ${jobData.id}`);
    return true;
  } catch (err) {
    logger.error(`[EMAIL] Exception sending error email: ${err.message}`);
    return false;
  }
}

module.exports = {
  sendJobCompletionEmail,
  sendErrorEmail,
};
