import React, { useState } from 'react';
import { api } from '../generated/react-query-client';

export function Catering() {
  // `shop/catering/book.endpoint.ts` has no catering/router.module.ts,
  // so `catering` contributes to the URL only. The hook lives on the
  // parent shop bucket: `api.shop.useCateringBook`.
  const book = api.shop.useCateringBook();
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');

  return (
    <section>
      <h2>Catering</h2>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email || !date) {
            return;
          }
          await book.mutateAsync({ data: { email, date } });
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button type="submit" disabled={book.isPending}>
          Book
        </button>
      </form>
      {book.data && (
        <p>
          Booked for {book.data.for} on {book.data.on}
        </p>
      )}
    </section>
  );
}
