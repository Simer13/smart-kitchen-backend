// server.js on Render.com (your backend)
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- IMPORTANT: Load API keys from Render's environment variables ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

// --- API Endpoint to Generate Recipe ---
app.post('/api/generate-recipe', async (req, res) => {
  const { ingredients, filters } = req.body;

  if (!ingredients || ingredients.length === 0) {
    return res.status(400).json({ error: "No ingredients provided. Please specify ingredients." });
  }

  console.log("Received ingredients:", ingredients);
  console.log("Received filters:", filters);

  let aiSuggestion = ""; // Initialize with empty string
  let realRecipeData = null;

  // 1. Call OpenAI for AI Recipe Suggestion
  try {
    console.log("Calling OpenAI...");

    // *** MODIFIED PROMPT FOR BETTER AI SUGGESTIONS ***
    const prompt = `Given the ingredients: ${ingredients.join(', ')}.
    ${filters.time !== 'No limit' ? `The user wants a recipe that takes ${filters.time}.` : ''}
    ${filters.mood !== 'No limit' ? `The user is in a ${filters.mood} mood.` : ''}
    ${filters.type !== 'Anything' ? `The user prefers ${filters.type} recipes.` : ''}

    Your goal is to suggest a **creative, realistic, and efficient recipe idea** using primarily the provided ingredients.
    Focus on:
    1. Maximizing the use of the ingredients provided.
    2. Suggesting a dish that can be made quickly, especially if time is limited.
    3. Providing a simple, practical solution for "emergency cooking" or when food is limited.
    4. If an ingredient is missing for a classic dish, suggest a plausible substitution.

    Provide only the recipe idea name and a very brief description of what it is (e.g., "Speedy Chicken Stir-fry: A quick one-pan meal maximizing leftover chicken and veggies.").`;

    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo", // You can experiment with "gpt-4o" for better quality if desired and available
      messages: [
        { role: "system", content: "You are a helpful culinary AI focused on practical, efficient, and creative recipe solutions using limited ingredients." },
        { role: "user", content: prompt } // Using the refined prompt
      ],
      max_tokens: 200, // Increased max_tokens slightly for more detailed descriptions
      temperature: 0.8, // Slightly higher temperature for more creativity
    }, {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
    });
    aiSuggestion = openaiResponse.data.choices[0].message.content.trim();
    console.log("OpenAI response received.");
  } catch (error) {
    console.error("Error calling OpenAI:", error.response ? error.response.data : error.message);
    aiSuggestion = "AI recipe idea could not be generated at this time.";
  }

  // 2. Call Spoonacular for Real Recipe Match
  try {
    console.log("Calling Spoonacular...");
    const spoonacularIngredientsString = ingredients.join(',');

    const searchParams = {
      ingredients: spoonacularIngredientsString,
      number: 1, // Still fetching only one best match for now, as frontend only displays one
      ranking: 1, // Maximize used ingredients (important for 'less food' scenarios)
      ignorePantry: true,
      apiKey: SPOONACULAR_API_KEY,
    };

    // Apply time filter for Spoonacular
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

    // Apply diet type filter for Spoonacular
    if (filters.type === "Veg") {
      searchParams.diet = "vegetarian";
    }
    // Spoonacular's 'type' filter (e.g., 'main course', 'dessert') is complex with findByIngredients
    // and 'mood' is not a direct Spoonacular filter. The AI will handle these.

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

  // Send both AI suggestion and real recipe data back to the frontend
  res.json({ aiSuggestion, realRecipeData });
});

// --- Basic Health Check Route ---
app.get('/', (req, res) => {
  // It's fine to keep this message, but you could change it to reflect Render:
  res.send('Smart Kitchen Assistant Backend is running!');
});

// Start the server
const listener = app.listen(process.env.PORT, () => {
  console.log('Your backend app is listening on port ' + listener.address().port);
});