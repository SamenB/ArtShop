from pydantic import BaseModel, Field, EmailStr


class UserRequestAdd(BaseModel):
    username: str = Field(..., description="Username of the user")
    email: EmailStr = Field(..., description="Email of the user")
    password: str = Field(..., description="Password of the user raw")


class UserAdd(BaseModel):
    username: str = Field(..., description="Username of the user")
    email: EmailStr = Field(..., description="Email of the user")
    hashed_password: str = Field(..., description="Hashed password of the user")


class User(UserAdd):
    id: int = Field(..., description="ID of the user")
    hashed_password: str = Field(exclude=True)


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Email of the user")
    password: str = Field(..., description="Password of the user raw")
