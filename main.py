from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib


app = FastAPI(
    title="NLP Emotion Classification API",
    description="Emotion classification using NLP and Logistic Regression",
    version="1.0.0"
)


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
 

# Load complete ML pipeline
model = joblib.load("nlp_model_pipeline.pkl")


# Emotion labels
EMOTION_LABELS = {
    0: "sadness",
    1: "anger",
    2: "love",
    3: "surprise",
    4: "fear",
    5: "joy"
}


# Pydantic input validation
class TextInput(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        description="Text to classify"
    )


@app.get("/")
def home():
    return {
        "message": "NLP Emotion Classification API is running"
    }


@app.post("/predict")
def predict(data: TextInput):

    # Model pipeline handles vectorization automatically
    prediction = model.predict([data.text])[0]

    probability = model.predict_proba([data.text])[0]

    predicted_emotion = EMOTION_LABELS[int(prediction)]

    confidence = float(probability[int(prediction)])

    probabilities = {
        EMOTION_LABELS[int(class_id)]: float(prob)
        for class_id, prob in zip(model.classes_, probability)
    }

    return {
        "text": data.text,
        "predicted_emotion": predicted_emotion,
        "confidence": confidence,
        "probabilities": probabilities
    }