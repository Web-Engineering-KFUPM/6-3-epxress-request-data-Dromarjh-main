/**
===================================================================
Back-end Lab — Express request data
===================================================================

===================================================================
LAB SETUP INSTRUCTIONS
===================================================================

1. Navigate to the project directory:
   Open your terminal and run:
      cd 6-3-express-request-data

2. Install project dependencies:
   Run either of these commands:
      npm i
      OR
      npm install
      npm install express cors

3. Start the back-end server from terminal, path: 6-3-express-request-data-Dromarjh-main\6-3-express-request-data:
   Run:
      node server.js

  If your system blocks running npm commands (especially on Windows PowerShell),
   run this command first to allow script execution:
      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  
 * ============================================
 * TODO-1 (Server Setup):
 * ============================================
 *   - create Express app instance
 *   - start server on port 3000
 *   - show console.log("API running at http://localhost:3000")
 *   HINT: 
 *     const app = express();
 *     app.listen(3000, ()=> console.log(...));
 * 
 *============================================
 * TODO-2 (/echo route):
 * ============================================
 *   - create GET /echo
 *   - read "name" and "age" from req.query
 *   - if name OR age missing → return 400 JSON: { ok:false, error:"name & age required" }
 *   - else return JSON: { ok:true, name, age, msg:"Hello <name>, you are <age>" }
 *   HINT:
 *     app.get("/echo", (req,res)=>{ ... });
 *     const {name, age} = req.query;
 *
 * ============================================
 * TODO-3 (/profile/:first/:last route):
 * ============================================
 *   - create GET /profile/:first/:last
 *   - read first, last from req.params
 *   - return JSON: { ok:true, fullName: "<first> <last>" }
 *   HINT:
 *     app.get("/profile/:first/:last", (req,res)=>{ ... });
 *     const { first, last } = req.params;
 *
 * ============================================
 * TODO-4 (Param middleware):
 * ============================================
 *   - create app.param("userId", ...)
 *   - convert userId to number
 *   - if not a positive number → return 400 JSON: { ok:false, error:"userId must be positive number" }
 *   - else store numeric value into req.userIdNum and call next()
 *   HINT:
 *     app.param("userId", (req,res,next,userId)=>{ ... });
 *
 * ============================================
 * TODO-5 (/users/:userId route):
 * ============================================
 *   - create GET /users/:userId
 *   - return JSON: { ok:true, userId: req.userIdNum }
 *   HINT:
 *     app.get("/users/:userId", (req,res)=>{ ... });
 *
 *============================================
 *Test the following URLS
 *============================================
 *
 * # After running server:
 * 
 * curl "http://localhost:3000"
 *   → just see server up
 * 
 * curl "http://localhost:3000/echo?name=Ali&age=22"
 *   → 200 { ok:true, name:"Ali", age:"22", msg:"Hello Ali, you are 22" }
 *
 * curl -i "http://localhost:3000/echo?name=Ali"
 *   → 400 { ok:false, error:"name & age required" }
 *
 * curl "http://localhost:3000/profile/Jack/Black"
 *   → 200 { ok:true, fullName:"Jack Black" }
 *
 * curl "http://localhost:3000/users/42"
 *   → 200 { ok:true, userId:42 }
 *
 * curl -i "http://localhost:3000/users/abc"
 *   → 400 { ok:false, error:"userId must be positive number" }
 *
 * curl -i "http://localhost:3000/users/-5"
 *   → 400 { ok:false, error:"userId must be positive number" }
 *
 */

import express from "express";
const app = express();


// create server


// Query params: /echo?name=Ali&age=22


// Route params: /profile/First/Last


// Route param middleware example: /users/42


// Route params: /users/:userId route



