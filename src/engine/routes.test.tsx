import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { notePath, chatPath } from './routes';

describe('notePath and chatPath', () => {
  it('percent-encodes an id so a slash in it cannot break the path structure', () => {
    expect(notePath('a/b')).toBe('/note/a%2Fb');
    expect(chatPath('a/b')).toBe('/chat/a%2Fb');
  });

  it('percent-encodes a space and a hash so the segment survives the URL', () => {
    expect(notePath('weird id/#')).toBe('/note/weird%20id%2F%23');
    expect(chatPath('weird id/#')).toBe('/chat/weird%20id%2F%23');
  });
});

const ShowId = () => {
  const { id } = useParams();
  return <span data-testid="id">{id}</span>;
};

describe('an awkward id round-trips through the path and back via react-router', () => {
  it('decodes a note id that was encoded by notePath (AC 13)', () => {
    const id = 'weird id/#?&';
    render(
      <MemoryRouter initialEntries={[notePath(id)]}>
        <Routes>
          <Route path="/note/:id" element={<ShowId />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('id').textContent).toBe(id);
  });

  it('decodes a chat id that was encoded by chatPath (AC 13)', () => {
    const id = 'weird id/#?&';
    render(
      <MemoryRouter initialEntries={[chatPath(id)]}>
        <Routes>
          <Route path="/chat/:id" element={<ShowId />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('id').textContent).toBe(id);
  });
});
