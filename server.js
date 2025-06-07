// server.js on Render.com (your backend)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // <-- NEW: Gemini SDK

const app = express();
app.use(express.json());
app.use(cors());

// --- IMPORTANT: Load API keys from Render's environment variables ---
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // <-- REMOVED
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // <-- NEW: Gemini API Key
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

// Initialize Google Gemini API
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Choose the model you want to use. 'gemini-pro' is generally good for text.
const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });


// --- API Endpoint to Generate Recipe ---
app.post('/api/generate-recipe', async (req, res) => {
  const { ingredients, filters } = req.body;

  if (!ingredients || ingredients.length === 0) {
    return res.status(400).json({ error: "No ingredients provided. Please specify ingredients." });
  }

  console.log("Received ingredients:", ingredients);
  console.log("Received filters:", filters);

  let aiSuggestion = "";
  let realRecipeData = null;

  // 1. Call Google Gemini for AI Recipe Suggestion
  try {
    console.log("Calling Google Gemini...");

    const prompt = `Given the ingredients: ${ingredients.join(', ')}.
    ${filters.time !== 'No limit' ? `The user wants a recipe that takes ${filters.time}.` : ''}
    ${filters.mood !== 'No limit' ? `The user is in a ${filters.mood} mood.` : ''}
    ${filters.type !== 'Anything' ? `The user prefers ${filters.type} recipes.` : ''}

    Your goal is to suggest a **creative, realistic, and efficient recipe idea** using primarily the provided ingredients.
    Focus on:
    1. Maximizing the use of the ingredients provided.
    2. Suggesting a dish that can be made quickly, especially if time is limited.
    3. Providing a simple, practical solution for "emergency cooking" or when food is limited.
    4. If an ingredient is missing for a classic dish, suggest a plausible substitution, but emphasize using existing ingredients first.

    Provide only the recipe idea name and a very brief description of what it is (e.g., "Speedy Chicken Stir-fry: A quick one-pan meal maximizing leftover chicken and veggies.").`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    aiSuggestion = response.text().trim(); // Get the text content from Gemini's response
    console.log("Gemini response received.");

  } catch (error) {
    console.error("Error calling Google Gemini:", error.message);
    if (error.response) { // Axios error for some reason, though Gemini SDK handles network
      console.error("Gemini response data:", error.response.data);
    }
    aiSuggestion = "AI recipe idea could not be generated at this time. (Gemini error)";
  }

  // 2. Call Spoonacular for Real Recipe Match (This part remains the same)
  try {
    console.log("Calling Spoonacular...");
    const spoonacularIngredientsString = ingredients.join(',');

    const searchParams = {
      ingredients: spoonacularIngredientsString,
      number: 1,
      ranking: 1,
      ignorePantry: true,
      apiKey: SPOONACULAR_API_KEY,
    };

    if (filters.time && filters.time !== "No limit") {
      let maxReadyTime;
      if (filters.time === "<10 mins") {
        maxReadyTime = 10;
      } else if (filters.time === "<30 mins") {
        maxReadyTime = 30;
      }
      if (maxReadyTime) {
        searchParams.maxReadyTime = maxReadyTime;
      }
    }

    if (filters.type === "Veg") {
      searchParams.diet = "vegetarian";
    }

    const searchResponse = await axios.get(
      `https://api.spoonacular.com/recipes/findByIngredients`,
      { params: searchParams }
    );

    if (searchResponse.data && searchResponse.data.length > 0) {
      const recipeId = searchResponse.data[0].id;
      console.log(`Found Spoonacular recipe ID: ${recipeId}. Fetching details...`);

      const detailsResponse = await axios.get(
        `https://api.spoonacular.com/recipes/${recipeId}/information`,
        {
          params: {
            includeNutrition: true,
            apiKey: SPOONACULAR_API_KEY,
          },
        }
      );
      realRecipeData = detailsResponse.data;
      console.log("Spoonacular details received.");
    } else {
      console.log("No Spoonacular recipes found matching ingredients and filters.");
    }
  } catch (error) {
    console.error("Error calling Spoonacular:", error.response ? error.response.data : error.message);
  }

  res.json({ aiSuggestion, realRecipeData });
});

// --- Basic Health Check Route ---
app.get('/', (req, res) => {
  res.send('Smart Kitchen Assistant Backend is running with Gemini!');
});

// Start the server
const listener = app.listen(process.env.PORT, () => {
  console.log('Your backend app is listening on port ' + listener.address().port);
});