# Thu vien truyen

Dat EPUB trong `public/library/books/`, anh bia trong `public/library/covers/`, sau do them truyen vao `public/library.json`:

```json
{
  "id": "ten-truyen-khong-dau",
  "title": "Ten truyen",
  "author": "Ten tac gia",
  "genre": "Tien hiep",
  "status": "Dang ra",
  "description": "Mo ta ngan cua truyen.",
  "epub": "/library/books/ten-truyen.epub",
  "cover": "/library/covers/ten-truyen.webp",
  "chapterCount": 320,
  "updatedAt": "2026-08-19",
  "featured": true
}
```

Neu khong co anh bia, bo trong truong `cover`; website se dung `default-cover.webp`.
