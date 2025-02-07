import { Injectable } from '@nestjs/common';
import type { Appointment } from './appointment.entity';

@Injectable()
export class AppointmentRepository {
  private appointments: Appointment[] = [];

  create(userId: number, date: Date, address: string) {
    const appointment = {
      id: this.appointments.length + 1,
      userId,
      date,
      address,
    };
    this.appointments.push(appointment);
    return appointment;
  }

  hasConflict(date: Date) {
    return this.appointments.some(
      (appointment) => appointment.date.getTime() === date.getTime(),
    );
  }

  count(userId: number) {
    return this.appointments.filter(
      (appointment) => appointment.userId === userId,
    ).length;
  }
}
