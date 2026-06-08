import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness — process is up and serving. */
  @Get()
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness — dependencies reachable. Returns 503 with the report when degraded. */
  @Get('ready')
  async readiness() {
    const report = await this.health.readiness();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
