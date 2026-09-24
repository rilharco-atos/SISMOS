import { Global, Module } from '@nestjs/common';
import { WebsiteService } from './website.service';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [AuditModule],
  providers: [WebsiteService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
