// sms.js - Arkesel SMS Functions
// Handles formatting phone numbers and invoking the Arkesel API.

const SMS = {
  /**
   * Formats a local Ghana phone number into international format (233XXXXXXXXX)
   * @param {string} phone 
   * @returns {string} Formatted number
   */
  formatGhanaNumber(phone) {
    if (!phone) return '';
    
    // Check if original had plus, then strip non-digits
    let cleaned = phone.replace(/\D/g, '');
    
    // If it starts with 0 and has 10 digits (e.g. 0244123456), convert leading 0 to 233
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '233' + cleaned.substring(1);
    } else if (cleaned.length === 9 && !cleaned.startsWith('0') && !cleaned.startsWith('233')) {
      cleaned = '233' + cleaned;
    }
    
    // Return with mandatory '+' prefix for Arkesel SMS API v2 compatibility
    return '+' + cleaned;
  },

  /**
   * Sends a bulk SMS via Arkesel
   * @param {Array<string>} recipients Array of phone numbers
   * @param {string} messageText Message content
   * @param {string} senderID Sender identifier
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  async sendSMS(recipients, messageText, senderID = 'NAGSUENR') {
    if (!CONFIG.ARKESEL_API_KEY || CONFIG.ARKESEL_API_KEY === 'your-arkesel-api-key') {
      throw new Error('Arkesel API Key is not configured. Please specify a valid key in config.js.');
    }

    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided for the SMS broadcast.');
    }

    if (!messageText || messageText.trim() === '') {
      throw new Error('SMS message text cannot be empty.');
    }

    // Format all recipient numbers to 233XXXXXXXXX
    const formattedRecipients = recipients
      .map(phone => this.formatGhanaNumber(phone))
      .filter(phone => phone.length >= 9); // filter out empty or invalid length

    if (formattedRecipients.length === 0) {
      throw new Error('None of the provided recipient phone numbers are valid.');
    }

    try {
      const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': CONFIG.ARKESEL_API_KEY
        },
        body: JSON.stringify({
          sender: senderID,
          message: messageText,
          recipients: formattedRecipients
        })
      });

      if (!response.ok) {
        throw new Error(`Arkesel HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();

      // Arkesel API returns response status in 'status' or code === 1000 for success
      if (result.status === 'success' || result.code === 1000) {
        return {
          success: true,
          message: result.message || 'SMS broadcast sent successfully.',
          data: result
        };
      } else {
        throw new Error(result.message || 'Arkesel API failed to process the request.');
      }
    } catch (error) {
      console.error('SMS Error Details:', error);
      throw new Error(error.message || 'An unexpected error occurred while communicating with the SMS gateway.');
    }
  }
};
