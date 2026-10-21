import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [AppConfigModule.forRoot()],
  providers: [AppService],
})
export class AppModule { }
