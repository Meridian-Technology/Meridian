![ Logo](./meridian-logo.png)

Welcome to the main Meridian repository - this repository contains the code for the Meridian web app. Read the full documentation here:

# Getting Started - Installation

## **Prerequisites**

Before you start, make sure you have the following installed:

- Node.js (at least version 12.x)
- npm (usually comes with Node.js)

You can check your Node.js and npm versions by running **`node -v`** and **`npm -v`** in your terminal.

## **Cloning the Repository**

First, clone the repository to your local machine:

```bash
git clone git@github.com:Study-Compass/Study-Compass.git
cd your-project-directory
```

## **Installing Dependencies**

Our project has dependencies for both the frontend and backend. You need to install these separately. Navigate to each directory and install the required packages.

1. **Root Directory Installation**
    
    This will install any utilities and dependencies defined at the project level, such as Concurrently.
    
    ```bash
    npm install
    ```
    
2. **Frontend Installation**
    
    ```bash
    cd frontend
    npm install
    ```
    
3. **Backend Installation**
    
    ```bash
    cd ../backend
    npm install
    ```
    

## **Running the Application**

We use Concurrently to run our frontend and backend servers at the same time. You can start both with a single command:

```bash
npm run dev
```

This command is configured in the root **`package.json`** file and will launch both servers simultaneously. By default, the React application runs on **`localhost:3000`** and the Express server on **`localhost:5001`**.

## **Exploring the Application**

After starting the application, you can access:

- The React frontend at http://localhost:3000
- The Express backend at http://localhost:5001

Feel free to explore the API routes defined in the Express application and interact with the React frontend.

## **Next Steps**

Now that your environment is set up, you're ready to start developing! Here are a few suggestions for next steps:

- Explore the documentation for both the **`frontend`** and **`backend`** directories and components for more detailed information on the specifics of each part of the stack.
- Review the existing components and routes to get a feel for the application structure.
- Begin adding new features or modifying existing ones.

Thank you for contributing to our project! If you encounter any issues, please report them on our issues tracker.
