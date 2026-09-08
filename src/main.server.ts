import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * The prerenderer's entry point, mirroring main.ts.
 *
 * The BootstrapContext is not optional and not decoration: bootstrapApplication
 * throws NG0401 ("Missing Platform") without it, which is what every guide
 * written before Angular 20 will lead you into.
 */
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
