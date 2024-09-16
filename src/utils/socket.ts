import { Server } from 'socket.io';
import { ENV } from '../config/env';
const io = new Server();
const port = ENV.PORT || 3000;

io.on('connection', (socket) => {
  console.log(`connect: ${socket.id}`, socket.request.headers);

  socket.on('disconnect', () => {
    console.log(`disconnect: ${socket.id}`);
  });
});

io.listen(Number(port));