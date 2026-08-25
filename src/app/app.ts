import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'stampyx-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  host: { class: 'block h-full' },
})
export class App {}
