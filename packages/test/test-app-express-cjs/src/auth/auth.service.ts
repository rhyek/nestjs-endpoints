import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  checkPermission() {
    return true;
  }
}
