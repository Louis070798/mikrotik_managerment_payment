import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MetricCard } from './MetricCard';

test('renders MetricCard with all required fields', () => {
    const handleClick = vi.fn();

    render(
        <MetricCard
            title="WAN Download"
            value={100}
            unit="Mbps"
            period="Last 1 Hour"
            source="if-mib"
            freshness="12s"
            previousComparison="+5%"
            status="healthy"
            onClick={handleClick}
        />
    );

    expect(screen.getByText('WAN Download')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Mbps')).toBeInTheDocument();
    expect(screen.getByText(/Last 1 Hour/)).toBeInTheDocument();
    expect(screen.getByText(/if-mib/)).toBeInTheDocument();
    expect(screen.getByText(/\+5%/)).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();

    const card = screen.getByTestId('metric-wan-download');
    fireEvent.click(card);
    expect(handleClick).toHaveBeenCalledTimes(1);
});
