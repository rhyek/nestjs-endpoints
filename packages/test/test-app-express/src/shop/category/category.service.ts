import { Injectable } from '@nestjs/common';

@Injectable()
export class CategoryService {
  list() {
    return [{ id: 1, name: 'books' }];
  }
}
