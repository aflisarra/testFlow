import { FileUploaderComponent } from '@/app/components/file-uploader'
import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'

@Component({
  selector: 'app-file-uploads',
  standalone: true,
  imports: [PageTitleComponent, FileUploaderComponent],
  templateUrl: './file-uploads.component.html',
  styles: ``,
})
export class FileUploadsComponent {}
