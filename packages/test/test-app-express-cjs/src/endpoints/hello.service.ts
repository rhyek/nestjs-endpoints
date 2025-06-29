import { Injectable } from '@nestjs/common';

@Injectable()
export class HelloService {
  greet(name: string) {
    return `Hello, ${name}!`;
  }
}
