import { Injectable, NotFoundException } from '@nestjs/common';

export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export type Order = {
  id: number;
  productId: string;
  quantity: number;
  notes?: string;
  status: OrderStatus;
  total: number;
};

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];

  create(input: { productId: string; quantity: number; notes?: string }): Order {
    const order: Order = {
      id: this.orders.length + 1,
      ...input,
      status: 'pending',
      total: input.quantity * 12.5,
    };
    this.orders.push(order);
    return order;
  }

  list(status: OrderStatus | undefined, page: number): Order[] {
    const matching = this.orders.filter((order) => !status || order.status === status);
    return matching.slice((page - 1) * 20, page * 20);
  }

  find(id: number): Order {
    const order = this.orders.find((candidate) => candidate.id === id);
    if (!order) {
      throw new NotFoundException(`No order ${id}`);
    }
    return order;
  }

  cancel(id: number): Order {
    const order = this.find(id);
    order.status = 'cancelled';
    return order;
  }
}
