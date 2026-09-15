export class AppError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} messageAr - رسالة عربية واضحة تُعرض للطالب مباشرة
   */
  constructor(statusCode, messageAr) {
    super(messageAr);
    this.statusCode = statusCode;
    this.messageAr = messageAr;
  }
}
