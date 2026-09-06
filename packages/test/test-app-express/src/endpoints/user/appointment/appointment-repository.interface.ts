export type IAppointmentRepository = {
  create: (
    userId: number,
    date: Date,
    address: string,
  ) => Promise<{ id: number; date: Date; address: string }>;
  hasConflict: (date: Date) => boolean;
  count: (userId: number) => number;
};

export const AppointmentRepositoryToken = Symbol('AppointmentRepository');
