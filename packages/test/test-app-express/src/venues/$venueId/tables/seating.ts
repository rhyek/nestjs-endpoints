import { Injectable, Module } from '@nestjs/common';

/** Tells the floor staff a guest has a table. */
@Injectable()
export class SeatingNotifier {
  readonly sent: string[] = [];

  notify(tableId: number, guest: string) {
    this.sent.push(`${guest} at ${tableId}`);
  }
}

/** Imported by the tables router, for its endpoints. */
@Module({ providers: [SeatingNotifier], exports: [SeatingNotifier] })
export class SeatingModule {}
