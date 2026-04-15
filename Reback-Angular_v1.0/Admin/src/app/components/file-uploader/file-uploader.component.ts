import { Component, Input } from '@angular/core'
import {
  DROPZONE_CONFIG,
  DropzoneConfigInterface,
  DropzoneModule,
} from 'ngx-dropzone-wrapper'

type UploadedFile = {
  name: string
  size: number
  type: string
  dataURL?: string
}

const DEFAULT_DROPZONE_CONFIG: DropzoneConfigInterface = {
  // Change this to your upload POST address:
  url: 'https://httpbin.org/post',
  maxFilesize: 50,
  acceptedFiles: 'image/*',
}

@Component({
  selector: 'FileUploader',
  standalone: true,
  imports: [DropzoneModule],
  template: `
    <dropzone
      class="dropzone"
      [config]="dropzoneConfig"
      [message]="dropzone"
      (success)="onUploadSuccess($event)"
    ></dropzone>

    @if (showPreview && uploadedFiles) {
      <ul class="list-unstyled mb-0" id="dropzone-preview">
        @for (file of uploadedFiles; track $index) {
          <li class="mt-2" id="dropzone-preview-list">
            <div class="border rounded">
              <div class="d-flex align-items-center p-2">
                <div class="flex-shrink-0 me-3">
                  <div class="avatar-sm bg-light rounded">
                    <img
                      data-dz-thumbnail
                      [src]="file.dataURL"
                      class="img-fluid rounded d-block"
                      src="#"
                      alt="Dropzone-Image"
                    />
                  </div>
                </div>
                <div class="flex-grow-1">
                  <div class="pt-1">
                    <h5 class="fs-14 mb-1" data-dz-name>
                      &nbsp; {{ file.name }}
                    </h5>
                    <p class="fs-13 text-muted mb-0" data-dz-size>
                      {{ file.size }}
                    </p>
                    <strong
                      class="error text-danger"
                      data-dz-errormessage
                    ></strong>
                  </div>
                </div>
                <div class="flex-shrink-0 ms-3">
                  <button
                    (click)="removeFile($index)"
                    data-dz-remove
                    class="btn btn-sm btn-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
  providers: [
    {
      provide: DROPZONE_CONFIG,
      useValue: DEFAULT_DROPZONE_CONFIG,
    },
  ],
})
export class FileUploaderComponent {
  @Input() showPreview: boolean = false

  dropzone = `<div class="dz-message needsclick">
    <i class="h1 bx bx-cloud-upload"></i>
    <h3 class="mb-0">
        Drop files here or click to
        upload.
    </h3>
    <span class="text-muted fs-13">
        (This is just a demo
        dropzone. Selected files are
        <strong>not</strong>
        actually uploaded.)
    </span>
  </div>`
  dropzoneConfig: DropzoneConfigInterface = {
    url: 'https://httpbin.org/post',
    maxFilesize: 50,
    clickable: true,
    addRemoveLinks: true,
  }
  uploadedFiles: any[] = []

  ngOnInit(): void {
    if (this.showPreview == true) {
      this.dropzoneConfig.previewsContainer = false
    }
  }
  // File Upload
  imageURL: string = ''
  onUploadSuccess(event: UploadedFile[]) {
    setTimeout(() => {
      this.uploadedFiles.push(event[0])
    }, 0)
  }

  // File Remove
  removeFile(index: number) {
    this.uploadedFiles.splice(index, 1)
  }
}
