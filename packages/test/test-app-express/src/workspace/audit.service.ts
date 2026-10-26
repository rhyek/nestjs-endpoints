import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  trail() {
    return 'audited';
  }
}
