import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/decorators';
import { MetricsService } from './metrics.service';

@Public()
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  render(): string {
    return this.metrics.render();
  }
}
