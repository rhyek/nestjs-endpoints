import { Module } from '@nestjs/common';

export class Clock {}

export class ClockModule {}
Module({ providers: [Clock], exports: [Clock] })(ClockModule);
