const database = {
  keyRoomId: {
    sessionName: '',
    users: [
      {
        role: '',
        username: '',
        userId: '',
        socketId: '',
      },
    ],
    issues: [
      {
        id: '',
        title: '',
        body: '',
        votingInProgress: false,
        finishedUserVoting: false,
        votes: [
          {
            userId: '',
            vote: {
              label: '&#189;',
              value: 0.5,
              deterministic: true,
            },
          },
        ],
      },
    ],
  },
};

// helper function to disconnect from room
function disconnectFromRoom({ socket, socketId, room }) {
  const index = database[room].users.findIndex((user) => user.socketId === socketId);

  if (index >= 0) {
    database[room].users.splice(index, 1);
  }

  console.log(`Users database after disconnect ${database[room].users}`); // eslint-disable-line no-console

  // update session on all clients
  socket.nsp.to(room).emit('updateSession', database[room]);
  // notifiy all users that socketID can disconnect (client will enforce it for the user)
  socket.nsp.to(room).emit('canDisconnect', socketId);
}

// check if room id exists
const checkRoom = (roomId) => {
  if (database[roomId]) {
    return database[roomId];
  }

  return null;
};

// handle user connection to websockets
// socket, io, redisClient
const handleUserConnect = (socket) => {
  // user data
  const { role } = socket.handshake.query;
  const { username } = socket.handshake.query;
  const { userId } = socket.handshake.query;
  const { id } = socket;

  // room/session data
  const { room } = socket.handshake.query;
  const { sessionName } = socket.handshake.query;

  console.log(`User ${username} with userId ${userId} connected on room ${room} with name ${sessionName} with socket id ${id}`); // eslint-disable-line no-console

  if (!database[room]) {
    database[room] = {
      sessionName: '',
      users: [],
      issues: [],
    };
  }

  // join room
  socket.join(room);

  // update sessionName (if it didn't exist yet)
  if (!database[room].sessionName && sessionName && sessionName.length) {
    database[room].sessionName = sessionName;
  }

  // update users on db
  const userFoundIndex = database[room].users.findIndex((user) => user.userId === userId);

  if (userFoundIndex >= 0) {
    database[room].users[userFoundIndex].username = username;
    database[room].users[userFoundIndex].socketId = id;
  } else {
    database[room].users.push({
      role,
      username,
      userId,
      socketId: id,
    });
  }

  // update session on all clients after first connection
  setTimeout(() => {
    socket.nsp.to(room).emit('updateSession', database[room]);
  }, 300);

  // **EVENT** disconnect
  socket.on('disconnect', (reason) => {
    console.log(`User ${username} disconnected on room ${room}: ${reason}`); // eslint-disable-line no-console
  });

  // **EVENT** event to trigger disconnect from room
  socket.on('disconnectFromRoom', (socketId) => {
    disconnectFromRoom({
      socket,
      socketId,
      room,
    });
  });

  // **EVENT** leave room (needs to be a different event so that we can forcefully remove a user)
  socket.on('leaveRoom', (socketId) => {
    // if it's the same socket leaving, do socket.leave
    if (socketId === id) {
      console.log(`User ${username} left the room ${room}`); // eslint-disable-line no-console
      socket.leave(room);
    }
  });

  // **EVENT** force remove user
  socket.on('forceRemoveUser', (socketId) => {
    disconnectFromRoom({
      socket,
      socketId,
      room,
    });
  });

  // **EVENT** update session name
  socket.on('updateSessionName', (newSessionName) => {
    database[room].sessionName = newSessionName;

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });

  // **EVENT** update issues list
  socket.on('updateIssuesList', (issues) => {
    database[room].issues = issues;

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });

  // **EVENT** update voting issue status
  socket.on('updateVotingIssueStatus', ({ issueId, started, stopped }) => {
    const issueIndex = database[room].issues.findIndex((issue) => issue.number === issueId);

    if (issueIndex >= 0) {
      if (started) {
        database[room].issues[issueIndex].votingInProgress = true;
      } else if (stopped) {
        database[room].issues[issueIndex].votingInProgress = false;
        database[room].issues[issueIndex].finishedUserVoting = true;
      }
    }

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });

  // **EVENT** users voting on issue
  socket.on('castVoteOnIssue', ({ issueId, vote }) => {
    const issueIndex = database[room].issues.findIndex((issue) => issue.number === issueId);

    if (issueIndex >= 0) {
      const userVoteIndex = database[room].issues[issueIndex].votes
        .findIndex((v) => v.userId === userId);

      if (userVoteIndex >= 0) {
        database[room].issues[issueIndex].votes[userVoteIndex].vote = vote;
      } else {
        database[room].issues[issueIndex].votes.push({
          userId,
          vote,
        });
      }
    }

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });

  // **EVENT** final admin vote
  socket.on('finalizeVoting', ({ issueId, vote }) => {
    const issueIndex = database[room].issues.findIndex((issue) => issue.number === issueId);

    if (issueIndex >= 0) {
      database[room].issues[issueIndex].finalVote = vote;
    }

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });

  // **EVENT** reset issue
  socket.on('resetIssue', ({ issueId }) => {
    const issueIndex = database[room].issues.findIndex((issue) => issue.number === issueId);

    if (issueIndex >= 0) {
      delete database[room].issues[issueIndex].finalVote;
      delete database[room].issues[issueIndex].votingInProgress;
      delete database[room].issues[issueIndex].finishedUserVoting;
      database[room].issues[issueIndex].votes = [];
    }

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });

  // **EVENT** make user an admin
  socket.on('makeAdmin', ({ user }) => {
    const userIndex = database[room].users.findIndex((u) => u.userId === user.userId);

    if (userIndex >= 0) {
      database[room].users[userIndex].role = 'admin';
    }

    // update session on all clients
    socket.nsp.to(room).emit('updateSession', database[room]);
  });
};

module.exports = { handleUserConnect, checkRoom };
