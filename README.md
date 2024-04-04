# actions-image

Post a image on the pull request. Usefull for screenshots of failed E2E tests.


## Requirements

If you encounter the **"Resource not accessible by integration"** you need to add the following permissions:

```yml
permissions:
    contents: write
    actions: read
    checks: write
```

## Inputs

### `GITHUB_TOKEN` - **REQUIRED**

> The github token to perform api actions, can be set to `${{GITHUB_TOKEN}}` or a custom one.

### `path` - **REQUIRED**

> The path to the image files, it supports glob. `(Ex: ./my-image/**/*.png)`

### `title` - _OPTIONAL_

> The title to display on the annotations `(Ex: Failed E2E Tests)`

### `uploadHost` - _OPTIONAL_

> Where to upload the pictures to `(Default: cloudinary)`, uses form POST to upload.

### `cloud-name` - **REQUIRED** if `uploadHost` is set to `cloudinary`

> Cloudinary account name

### `api-key` - **REQUIRED** if `uploadHost` is set to `cloudinary`

> Cloudinary API Key

### `api-secret` - **REQUIRED** if `uploadHost` is set to `cloudinary`

> Cloudinary API Secret Key

## Example usage

```yaml
- name: Upload failed tests
  if: ${{ failure() }}
  uses: edunad/actions-image@v2.0.0
  with:
      path: './test/pics/**'
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      title: 'Meow 🙀'
      cloud-name: dqydn2j2x
      api-key: 155652779465454
      api-secret: ${{ secrets.CLOUDINARY_API_SECRET }}
```
