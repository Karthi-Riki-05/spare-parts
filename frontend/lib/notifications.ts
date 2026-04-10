/**
 * Browser Notifications API wrapper
 */

export const notifications = {
  /**
   * Request permission from the user
   */
  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('This browser does not support desktop notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  },

  /**
   * Send a system-level notification
   */
  async send(title: string, body: string, options: NotificationOptions = {}): Promise<Notification | null> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return null;

    try {
      const notif = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'spare-parts-verifier',
        ...options,
      });
      return notif;
    } catch (err) {
      console.error('Failed to send notification:', err);
      return null;
    }
  },

  /**
   * Notify that normalization is ready for review
   */
  async notifyNormalizationReady(fileName: string, jobId: string): Promise<void> {
    const notif = await this.send(
      '📋 Data Ready for Review',
      `${fileName} extracted. Click to review.`,
      { tag: `review-${jobId}` }
    );
    if (notif) {
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    }
  },

  /**
   * Notify that verification is complete
   */
  async notifyVerificationComplete(fileName: string, jobId: string, score90Count: number): Promise<void> {
    const notif = await this.send(
      '✅ Verification Complete',
      `${fileName} — ${score90Count} official sources found.`,
      { tag: `complete-${jobId}` }
    );
    if (notif) {
      notif.onclick = () => {
        window.focus();
        window.location.href = `/results/${jobId}`;
        notif.close();
      };
    }
  },
};
