import { Injectable } from '@nestjs/common';

@Injectable()
export class CartService {
  add(item: string) {
    return { added: item };
  }
}
