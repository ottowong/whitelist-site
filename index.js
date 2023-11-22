const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const directoryPath = "path-to-server-folder"

app.use(bodyParser.urlencoded({ extended: true }));

const db = new sqlite3.Database('whitelist.db', (err) => {
    if (err) {
      console.error(err.message);
    } else {
      // Create a table for whitelist applications if it doesn't exist
      db.run(`CREATE TABLE IF NOT EXISTS whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        approved BOOLEAN DEFAULT 0
      )`, (err) => {
        if (err) {
          console.error(err.message);
        }
      });
    }
  });

// Middleware for basic authentication
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const adminPassword = 'token'; // Change this to your desired password
  
      if (token === adminPassword) {
        return next(); // Authentication successful, proceed to next middleware
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).send('Authentication required');
  };
  
  app.get('/', (req, res) => {
    // Fetch rows from the whitelist table
    db.all('SELECT * FROM whitelist', [], (err, rows) => {
      if (err) {
        console.error(err.message);
        res.send('Error fetching whitelist');
      } else {
        let whitelistHTML = '<h1>Whitelist Application</h1>';
        whitelistHTML += `
          <form action="/apply" method="post">
            <label for="username">Minecraft Username:</label>
            <input type="text" id="username" name="username" required>
            <button type="submit">Apply</button>
          </form>
          <h2>Users Awaiting Approval:</h2>
          <ul>
        `;
        // Render each user awaiting approval
        rows.forEach((row) => {
          if (!row.approved) {
            whitelistHTML += `<li>${row.username}</li>`;
          }
        });
        whitelistHTML += '</ul>';
  
        whitelistHTML += '<h2>Approved Users:</h2>';
        whitelistHTML += '<ul>';
        // Render each approved user
        rows.forEach((row) => {
          if (row.approved) {
            whitelistHTML += `<li>${row.username}</li>`;
          }
        });
        whitelistHTML += '</ul>';
  
        res.send(`
          <html>
            <body>
              ${whitelistHTML}
            </body>
          </html>
        `);
      }
    });
  });

// Admin page to approve whitelist applications
app.get('/admin', auth, (req, res) => {
    // Fetch all rows from the whitelist table
    db.all('SELECT * FROM whitelist', [], (err, rows) => {
      if (err) {
        console.error(err.message);
        res.send('Error fetching whitelist');
      } else {
        let adminHTML = '<h1>Admin Panel</h1>';
        adminHTML += '<h2>Users Awaiting Approval:</h2>';
        adminHTML += '<ul>';
        // Render each user awaiting approval with "Approve" and "Reject" buttons
        rows.forEach((row) => {
          if (!row.approved) {
            adminHTML += `
              <li>${row.username}
                <form action="/approve" method="post" style="display: inline;">
                  <input type="hidden" name="username" value="${row.username}">
                  <button type="submit">Approve</button>
                </form>
                <form action="/reject" method="post" style="display: inline;">
                  <input type="hidden" name="username" value="${row.username}">
                  <button type="submit">Reject</button>
                </form>
              </li>`;
          }
        });
        adminHTML += '</ul>';
  
        adminHTML += '<h2>Approved Users:</h2>';
        adminHTML += '<ul>';
        // Render each approved user with a "Remove" button
        rows.forEach((row) => {
          if (row.approved) {
            adminHTML += `
              <li>${row.username} <form action="/remove" method="post" style="display: inline;">
                <input type="hidden" name="username" value="${row.username}">
                <button type="submit">Remove</button>
              </form></li>`;
          }
        });
        adminHTML += '</ul>';
  
        // Input box and button for sending commands
        adminHTML += `
          <h2>Send Command</h2>
          <form action="/sendCommand" method="post">
            <input type="text" name="command" placeholder="Enter command">
            <button type="submit">Send Command</button>
          </form>
        `;
  
        res.send(`
          <html>
            <body>
              ${adminHTML}
            </body>
          </html>
        `);
      }
    });
  });

// Handle whitelist approval
app.post('/approve', auth, (req, res) => {
    const { username } = req.body;
    // Update the approved status to 1 (true) for the specified username
    db.run('UPDATE whitelist SET approved = 1 WHERE username = ?', [username], (err) => {
      if (err) {
        console.error(err.message);
        res.send('Error approving user');
      } else {
        sendCommand("/whitelist add "+username)
        res.redirect('/admin');
      }
    });
  });

  // Handle rejection of users from the whitelist
app.post('/reject', auth, (req, res) => {
    const { username } = req.body;
    // Remove the specified username from the whitelist
    db.run('DELETE FROM whitelist WHERE username = ?', [username], (err) => {
      if (err) {
        console.error(err.message);
        res.send('Error rejecting user');
      } else {
        res.redirect('/admin');
      }
    });
  });

// Handle removal of approved users from the whitelist
app.post('/remove', auth, (req, res) => {
    const { username } = req.body;
    // Remove the specified username from the whitelist
    db.run('DELETE FROM whitelist WHERE username = ?', [username], (err) => {
      if (err) {
        console.error(err.message);
        res.send('Error removing user');
      } else {
        sendCommand("/whitelist remove "+username)
        res.redirect('/admin');
      }
    });
  });

  // Endpoint to trigger the command
  app.post('/sendCommand', (req, res) => {
    sendCommand('/say hello');
    res.redirect('/');
  });

  app.post('/apply', (req, res) => {
    const { username } = req.body;
    // Insert the submitted username into the database with "approved" set to 0 (false) by default
    db.run('INSERT INTO whitelist (username) VALUES (?)', [username], (err) => {
      if (err) {
        console.error(err.message);
        res.send('Error submitting application');
      } else {
        res.redirect('/');
      }
    });
  });

  // Handle sending commands from the admin page
app.post('/sendCommand', auth, (req, res) => {
    const { command } = req.body;
    sendCommand(command);  
    res.redirect('/admin'); // Redirect back to the admin page
  });

const svEnv = spawn("java", [
  "-Xms8192M",
  "-Xmx8192M",
  "-jar",
  "server.jar",
  "nogui"
], { 
  shell: true, 
  detached: false, 
  cwd: `${directoryPath}`, 
  stdio: [
    "pipe"
  ]
});



// Handle server output/error
svEnv.stdout.on("data", out => {
  console.log(`Server Feedback: ${out}`);
});

svEnv.stderr.on("data", err => {
  if (!(err == "^C")){
    console.error(`~Server Error: ${err}`);
  }
});

// Function to send a command to the Minecraft server
function sendCommand(command) {
  svEnv.stdin.write(command + '\n');
}

// Usage example: Send a command to the Minecraft server
sendCommand('/say Hello, Minecraft server!');

const server = app.listen(4001, () => {
    console.log('Server running on port 4001');
  });