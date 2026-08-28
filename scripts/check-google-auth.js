const fs = require('fs');

async function test() {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=87210775239-hndkail5581s8cbj1ss70q0dusa919r2.apps.googleusercontent.com&redirect_to=https%3A%2F%2Ftram-chu.online&redirect_uri=https%3A%2F%2Fbckwrfucultwxirorglv.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email+profile&state=test';
  const res = await fetch(url);
  const body = await res.text();
  console.log('Status:', res.status);
  
  // Extract visible text or error message
  const textClean = body.replace(/<style[^>]*>.*?<\/style>/gis, '')
                        .replace(/<script[^>]*>.*?<\/script>/gis, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
  console.log('Text content:\n', textClean);
}

test();
