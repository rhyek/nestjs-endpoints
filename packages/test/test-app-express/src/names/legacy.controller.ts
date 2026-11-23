import { Controller, Inject, Injectable, Module, Post } from '@nestjs/common';

@Injectable()
export class LegacyService {
  readonly answer = 'legacy';
}

// A controller of the app's own beside the tree: its name is one beside the parameters too. Its
// getter reads what it injects, which only an instance has.
@Controller('names/legacy')
export class LegacyController {
  constructor(@Inject(LegacyService) private readonly service: LegacyService) {}

  get answer() {
    return this.service.answer;
  }

  @Post()
  legacy() {
    return this.answer;
  }
}

@Module({ controllers: [LegacyController], providers: [LegacyService] })
export class LegacyModule {}
