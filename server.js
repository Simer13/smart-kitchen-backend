// server.js on Glitch.com
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Required to allow requests from your React app

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies
// Enable CORS for all origins (for development).
// In production, you might restrict this to your frontend's domain for security.
app.use(cors());

// --- IMPORTANT: Load API keys from Glitch's .env environment variables ---
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
    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo", // You can use "gpt-4o" or other models if available
      messages: [
        { role: "system", content: "You are a helpful culinary AI. Provide a concise, creative recipe idea." },
        { role: "user", content: `Suggest a recipe idea using these ingredients: ${ingredients.join(', ')}. Consider these preferences: time: ${filters.time}, mood: ${filters.mood}, type: ${filters.type}. Keep it brief, just the idea.` }
      ],
      max_tokens: 180, // Adjust token limit if needed
      temperature: 0.7,
    }, {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
    });
    aiSuggestion = openaiResponse.data.choices[0].message.content.trim();
    console.log("OpenAI response received.");
  } catch (error) {
    console.error("Error calling OpenAI:", error.response ? error.response.data : error.message);
    // Log the error but don't stop the process, try Spoonacular
    aiSuggestion = "AI recipe idea could not be generated at this time.";
  }

  // 2. Call Spoonacular for Real Recipe Match
  try {
    console.log("Calling Spoonacular...");
    const spoonacularIngredientsString = ingredients.join(','); // Spoonacular expects comma-separated
    const spoonacularSearchUrl = `https://api.spoonacular.com/recipes/findByIngredients`;

    const searchParams = {
      ingredients: spoonacularIngredientsString,
      number: 1, // We only need one top match
      ranking: 1, // Maximize used ingredients (1 for highest, 2 for lowest)
      ignorePantry: true, // Don't filter based on pantry stock
      apiKey: SPOONACULAR_API_KEY,
    };

    const searchResponse = await axios.get(spoonacularSearchUrl, { params: searchParams });

    if (searchResponse.data && searchResponse.data.length > 0) {
      const recipeId = searchResponse.data[0].id;
      console.log(`Found Spoonacular recipe ID: ${recipeId}. Fetching details...`);

      const detailsUrl = `https://api.spoonacular.com/recipes/${recipeId}/information`;
      const detailsResponse = await axios.get(detailsUrl, {
        params: {
          includeNutrition: true, // Get nutrition info
          apiKey: SPOONACULAR_API_KEY
        }
      });
      realRecipeData = detailsResponse.data;
      console.log("Spoonacular details received.");
    } else {
      console.log("No Spoonacular recipes found matching ingredients.");
    }
  } catch (error) {
    console.error("Error calling Spoonacular:", error.response ? error.response.data : error.message);
    // Log the error, realRecipeData will remain null
  }

  // Send both AI suggestion and real recipe data back to the frontend
  res.json({ aiSuggestion, realRecipeData });
});

// --- Basic Health Check Route ---
app.get('/', (req, res) => {
  res.send('Smart Kitchen Assistant Backend is running on Glitch!');
});

// Start the server
const listener = app.listen(process.env.PORT, () => {
  console.log('Your Glitch app is listening on port ' + listener.address().port);
});