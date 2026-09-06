import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DashboardAvailability } from '../api';
import { DataStateNotice } from './DataStateNotice';

test('explains insufficient telemetry and exposes collector guidance without inventing values', () => {
    const retry = vi.fn();

    render(
        <DataStateNotice
            dataStatus="INSUFFICIENT_DATA"
            availability={{
                status: DashboardAvailability.status.INSUFFICIENT_DATA,
                code: DashboardAvailability.code.INSUFFICIENT_DATA,
                message: 'Traffic metrics are withheld.',
                missing_sources: ['INTERFACE_COUNTER', 'RADIUS_ACCOUNTING', 'IPFIX'],
            }}
            onRetry={retry}
        />,
    );

    expect(screen.getByText(/Inventory available; telemetry is insufficient/i)).toBeInTheDocument();
    expect(screen.getByText('INTERFACE_COUNTER')).toBeInTheDocument();
    expect(screen.getByText(/How to restore this data/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 bytes/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
});
