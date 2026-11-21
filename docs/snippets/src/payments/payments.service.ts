import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentsService {
  refund(orderId: number, reason: string, refundedBy: number): { refunded: boolean } {
    return { refunded: orderId > 0 && reason.length > 0 && refundedBy > 0 };
  }
}
