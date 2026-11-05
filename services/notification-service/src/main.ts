import 'dotenv/config';
import { boot } from '@smart/common';
import { AppModule } from './module';
void boot(AppModule, 'notification-service', 4004, async () => true);
