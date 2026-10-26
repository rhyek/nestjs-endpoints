import { Injectable } from '@nestjs/common';

@Injectable()
export class BillingService {
  name() {
    return 'billing';
  }
}
