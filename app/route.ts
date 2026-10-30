import shell from '../ui/shell.html?raw';

export function GET() {
  return new Response(shell, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
