import { Controller, Get, Header, Headers, UnauthorizedException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { ConfigService } from '../config/config.service';
import { MetricsService } from './metrics.service';

@Public()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  render(@Headers('authorization') authorization?: string): string {
    // When METRICS_TOKEN is configured, scraping requires `Authorization: Bearer <token>`.
    const token = this.config.env.METRICS_TOKEN;
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException('Metrics token required');
    }
    return this.metrics.render();
  }
}
