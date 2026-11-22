import { Injectable } from '@nestjs/common';

@Injectable()
export class ShopService {
  stats() {
    return { visitors: 42 };
  }
  promoToday() {
    return { code: 'TODAY10' };
  }
}
