import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkspaceService {
  name() {
    return 'acme';
  }
}
