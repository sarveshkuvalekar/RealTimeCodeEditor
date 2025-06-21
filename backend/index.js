import express from "express";
import http from 'http';
import { Server } from "socket.io";
import axios from "axios";
//Deployment-code
import path from "path";
//Deployment-code

const app = express();

const server = http.createServer(app);

// const io = new Server(server, {
//     cors: {
//         origin: "*",
//     },
// });

//Deployment-code
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://livecodelab.onrender.com"] 
            : ["http://localhost:3000", "http://localhost:5173"],
        methods: ["GET", "POST"],
        credentials: true
    },
});
//Deployment-code

const rooms = new Map();

io.on("connection", (socket) => {
    console.log("User Connected", socket.id)

    let currentRoom = null;
    let currentUser = null;

    socket.on("join", ({ roomId, userName }) => {
        if (currentRoom) {
            socket.leave(currentRoom)
            rooms.get(currentRoom).users.delete(currentUser)
            io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users))
        }

        currentRoom = roomId;
        currentUser = userName;

        socket.join(roomId)

        if (!rooms.has(roomId)) {
            rooms.set(roomId, { users: new Set(), code: "// start code here" })
        }

        rooms.get(roomId).users.add(userName)

        socket.emit("codeUpdate", rooms.get(roomId).code)

        io.to(roomId).emit("userJoined", Array.from(rooms.get(currentRoom).users))

    })

    socket.on("codeChange", ({ roomId, code }) => {
        if (rooms.has(roomId)) {
            rooms.get(roomId).code = code;
        }
        socket.to(roomId).emit("codeUpdate", code);
    });

    socket.on("leaveRoom", () => {
        if (currentRoom && currentUser) {
            rooms.get(currentRoom).users.delete(currentUser);
            io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));

            socket.leave(currentRoom);

            currentRoom = null;
            currentUser = null;
        }
    });

    socket.on("typing", ({ roomId, userName }) => {
        socket.to(roomId).emit("userTyping", userName);
    });

    socket.on("languageChange", ({ roomId, language }) => {
        io.to(roomId).emit("languageUpdate", language);
    });

    socket.on("compileCode", async ({ code, roomId, language, version, input}) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const response = await axios.post(
                "https://emkc.org/api/v2/piston/execute",
                {
                    language,
                    version,
                    files: [
                        {
                            content: code,
                        },
                    ],
                    stdin: input,
                } 
            );

            room.output = response.data.run.output;
            io.to(roomId).emit("codeResponse", response.data);
        }
    });


    socket.on("clearOutput", ({ roomId }) => {
        if (rooms.has(roomId)) {
            // Clear the stored output for the room
            const room = rooms.get(roomId);
            if (room.output) {
                room.output = "";
            }
            // Emit to all users in the room to clear their output
            io.to(roomId).emit("outputCleared");
        }
    });



    socket.on("disconnect", () => {
        if (currentRoom && currentUser) {
            rooms.get(currentRoom).users.delete(currentUser);
            io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
        }
        console.log("user Disconnected");
    });
})

const port = process.env.PORT || 5000;

// const __dirname = path.resolve();

// app.use(express.static(path.join(__dirname, "/frontend/dist")));

// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
// });

const __dirname = path.resolve();

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "/frontend/dist")));

// Catch all handler: send back React's index.html file for any non-API routes
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});